// Revolut is a redirect provider. The cart must be completed first, because the plugin only
// creates the Revolut order during cart completion — that is what guarantees a payable
// checkout_url can never exist before a Medusa order does. Only then do we send the customer off.
//
// cart.complete returns payment_collections but not payment_sessions, so the URL has to be read
// back with an explicit field expansion.
export async function placeRevolutOrder(cartId?: string) {
  const id = cartId || (await getCartId())

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const headers = { ...(await getAuthHeaders()) }

  const cartRes = await sdk.store.cart
    .complete(id, {}, headers)
    .then(async (res) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return res
    })
    .catch(medusaError)

  if (cartRes?.type !== "order") {
    return cartRes
  }

  const orderCacheTag = await getCacheTag("orders")
  revalidateTag(orderCacheTag)
  removeCartId()

  const { order } = await sdk.client.fetch<{ order: HttpTypes.StoreOrder }>(
    `/store/orders/${cartRes.order.id}`,
    {
      method: "GET",
      // `*` pulls every session field. Requesting only `.data` would omit provider_id, which
      // is needed to pick the Revolut session out of the collection.
      query: { fields: "*payment_collections.payment_sessions" },
      headers,
      cache: "no-store",
    }
  )

  const session = (order as any)?.payment_collections
    ?.flatMap((c: any) => c.payment_sessions ?? [])
    ?.find((s: any) => s.provider_id?.startsWith("pp_revolut"))

  const checkoutUrl = session?.data?.checkout_url

  if (!checkoutUrl) {
    // The order exists and is awaiting payment; send the customer to it rather than stranding
    // them on the checkout page with no feedback.
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase()
    redirect(`/${countryCode}/order/${cartRes.order.id}/confirmed`)
  }

  redirect(checkoutUrl)
}

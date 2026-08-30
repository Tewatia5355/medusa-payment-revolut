import { processPaymentWorkflow } from "@medusajs/core-flows"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules, PaymentActions } from "@medusajs/framework/utils"

// Provider id without the `pp_` prefix, which the Payment Module prepends.
const PROVIDER = "revolut_revolut"

// Medusa's built-in /hooks/payment/:provider route acknowledges with 200 and hands the event to
// the event bus. The local bus wraps subscribers in a try/catch that only logs, and the Redis bus
// swallows the final failed attempt. Processing ORDER_COMPLETED requires a second Revolut call, so
// a transient failure there would lose a captured payment permanently: Revolut has the money,
// Medusa's order stays awaiting payment, and Revolut will not retry because it already got a 200.
//
// This route does the same work synchronously and answers with a status Revolut can act on.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const paymentModule = req.scope.resolve(Modules.PAYMENT)

  let processed: Awaited<
    ReturnType<typeof paymentModule.getWebhookActionAndData>
  >
  try {
    processed = await paymentModule.getWebhookActionAndData({
      provider: PROVIDER,
      payload: {
        data: req.body as Record<string, unknown>,
        rawData: req.rawBody as Buffer,
        headers: req.headers as Record<string, unknown>,
      },
    })
  } catch (err) {
    // A bad signature is permanent, so tell Revolut to stop. Anything else — a 5xx or timeout
    // while retrieving the order — is transient and must be retried.
    const unauthorized =
      err instanceof MedusaError && err.type === MedusaError.Types.UNAUTHORIZED
    res.status(unauthorized ? 401 : 503).send((err as Error).message)
    return
  }

  // Acknowledge anything not actionable so Revolut stops resending it.
  const actionable =
    processed.action === PaymentActions.SUCCESSFUL ||
    processed.action === PaymentActions.AUTHORIZED
  if (!actionable || !processed.data?.session_id) {
    res.sendStatus(200)
    return
  }

  try {
    await processPaymentWorkflow(req.scope).run({ input: processed })
  } catch (err) {
    res.status(503).send((err as Error).message)
    return
  }

  res.sendStatus(200)
}

import { processPaymentWorkflow } from "@medusajs/core-flows"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PaymentActions,
} from "@medusajs/framework/utils"
import { CONFLICT_MARKER } from "../../../providers/revolut/service"

// Provider id without the `pp_` prefix, which the Payment Module prepends.
const PROVIDER = "revolut_revolut"

// Medusa's built-in /hooks/payment/:provider route acknowledges with 200 and hands the event to the
// event bus, which only logs subscriber failures. Since processing needs a second Revolut call, a
// transient failure there would lose a captured payment with no retry from either side. This route
// does the work synchronously so the response can ask Revolut to redeliver.

// Revolut retries any error response three more times at ten-minute intervals and accepts
// anything in 200-399. Two failures are permanent and must never be retried: a bad signature will
// never become valid, and a drifted order (CONFLICT) will never reconcile itself. Everything else
// — a 5xx or timeout reaching Revolut — is transient and should be retried.
const respondToFailure = (
  req: MedusaRequest,
  res: MedusaResponse,
  err: unknown
): void => {
  const type = err instanceof MedusaError ? err.type : undefined
  const message = (err as Error)?.message ?? String(err)

  // Medusa rethrows provider errors from inside a workflow as plain Errors, so the type is only
  // available when the failure came from getWebhookActionAndData. Fall back to the marker.
  if (
    type === MedusaError.Types.CONFLICT ||
    message.includes(CONFLICT_MARKER)
  ) {
    // Money may sit captured at Revolut with nothing recorded here. That needs an operator,
    // not a retry storm that ends in silence.
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `Revolut webhook conflict, manual reconciliation required: ${message}`
      )
    res.sendStatus(204)
    return
  }

  if (type === MedusaError.Types.UNAUTHORIZED) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`Rejected Revolut webhook: ${message}`)
    res.sendStatus(204)
    return
  }

  res.status(503).send(message)
}

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
    return respondToFailure(req, res, err)
  }

  // Acknowledge anything not actionable so Revolut stops resending it.
  if (
    processed.action !== PaymentActions.SUCCESSFUL ||
    !processed.data?.session_id
  ) {
    res.sendStatus(200)
    return
  }

  try {
    // authorizePayment runs inside this workflow, so a drift CONFLICT surfaces here, not above.
    await processPaymentWorkflow(req.scope).run({ input: processed })
  } catch (err) {
    return respondToFailure(req, res, err)
  }

  res.sendStatus(200)
}

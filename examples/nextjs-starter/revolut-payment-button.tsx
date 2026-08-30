// Completes the cart first, then redirects to Revolut's hosted checkout. Do not reverse this:
// the plugin creates the Revolut order during completion precisely so that a payable URL cannot
// exist before the order does. Redirecting first would allow a customer to pay for a cart that
// then fails to become an order.
const RevolutPaymentButton = ({
  notReady,
  "data-testid": dataTestId,
}: {
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await placeRevolutOrder()
    } catch (err: any) {
      // next/navigation redirect() throws by design; let it through.
      if (err?.digest?.startsWith("NEXT_REDIRECT")) {
        throw err
      }
      setErrorMessage(err?.message ?? "Could not start the Revolut payment")
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid={dataTestId}
      >
        Pay with Revolut
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="revolut-payment-error-message"
      />
    </>
  )
}

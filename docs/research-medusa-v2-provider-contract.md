Agent is idle (waiting for messages). agent_id: f56ef783-0665-4e4b-bf9c-297a30b95e2c, agent_type: research, status: idle, description: Research Medusa v2 payment provider, elapsed: 622s, total_turns: 1, model: gpt-5.6-sol

[Turn 0]
# MedusaJS v2 payment-provider contract

**Source baseline:** Medusa **v2.19.0**. The core provider contract files are unchanged on `develop` at commit [`f7317903600e5b64f06c21c29a73e0e569d2fe3a`](https://github.com/medusajs/medusa/commit/f7317903600e5b64f06c21c29a73e0e569d2fe3a). This report excludes all v1 `PaymentService` / `medusa-payment-*` conventions.

---

## 1. Abstract class and exact method contract

The public base class is:

```ts
import { AbstractPaymentProvider } from "@medusajs/framework/utils"
```

`@medusajs/framework/utils` re-exports `@medusajs/utils`, whose payment barrel exports the class. [`medusajs/medusa@v2.19.0:packages/core/framework/src/utils/index.ts:1-5`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/framework/src/utils/index.ts#L1-L5) [`medusajs/medusa@v2.19.0:packages/core/utils/src/payment/index.ts:1-4`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/index.ts#L1-L4)

The class declaration, constructor, identifier, and built-in lookup are:

```ts
export abstract class AbstractPaymentProvider<
  TConfig = Record<string, unknown>
> implements IPaymentProvider {
  static validateOptions(options: Record<any, any>): void | never {}

  protected constructor(
    cradle: Record<string, unknown>,
    protected readonly config: TConfig = {} as TConfig
  )

  public static identifier: string

  public getIdentifier(): string
}
```

`validateOptions` is optional because the base implementation is a no-op. `getIdentifier` is implemented for you and throws if the static `identifier` is missing. [`medusajs/medusa@v2.19.0:packages/core/utils/src/payment/abstract-payment-provider.ts:25-53`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L25-L53) [`medusajs/medusa@v2.19.0:packages/core/utils/src/payment/abstract-payment-provider.ts:105-155`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L105-L155)

### Mandatory abstract methods

These ten methods are abstract and therefore required:

```ts
abstract initiatePayment(
  input: InitiatePaymentInput
): Promise<InitiatePaymentOutput>

abstract authorizePayment(
  input: AuthorizePaymentInput
): Promise<AuthorizePaymentOutput>

abstract capturePayment(
  input: CapturePaymentInput
): Promise<CapturePaymentOutput>

abstract refundPayment(
  input: RefundPaymentInput
): Promise<RefundPaymentOutput>

abstract cancelPayment(
  input: CancelPaymentInput
): Promise<CancelPaymentOutput>

abstract deletePayment(
  input: DeletePaymentInput
): Promise<DeletePaymentOutput>

abstract retrievePayment(
  input: RetrievePaymentInput
): Promise<RetrievePaymentOutput>

abstract getPaymentStatus(
  input: GetPaymentStatusInput
): Promise<GetPaymentStatusOutput>

abstract updatePayment(
  input: UpdatePaymentInput
): Promise<UpdatePaymentOutput>

abstract getWebhookActionAndData(
  data: ProviderWebhookPayload["payload"]
): Promise<WebhookActionResult>
```

Citations by method: [`capturePayment`:207-209](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L207-L209), [`authorizePayment`:280-282](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L280-L282), [`cancelPayment`:325-327](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L325-L327), [`initiatePayment`:390-392](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L390-L392), [`deletePayment`:441-443](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L441-L443), [`getPaymentStatus`:486-488](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L486-L488), [`refundPayment`:543-545](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L543-L545), [`retrievePayment`:575-577](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L575-L577), [`updatePayment`:623-625](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L623-L625), [`getWebhookActionAndData`:709-711](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L709-L711).

**There is no `getWebhookActionAndSubscribe`.** The current and original v2 method name is `getWebhookActionAndData`. [`medusajs/medusa@v2.0.0:packages/core/types/src/payment/provider.ts:256-258`](https://github.com/medusajs/medusa/blob/v2.0.0/packages/core/types/src/payment/provider.ts#L256-L258)

### Optional account-holder/payment-method methods

These are optional members of `IPaymentProvider`, not abstract declarations on `AbstractPaymentProvider`:

```ts
retrieveAccountHolder?(
  data: RetrieveAccountHolderInput
): Promise<RetrieveAccountHolderOutput>

createAccountHolder?(
  data: CreateAccountHolderInput
): Promise<CreateAccountHolderOutput>

updateAccountHolder?(
  data: UpdateAccountHolderInput
): Promise<UpdateAccountHolderOutput>

deleteAccountHolder?(
  data: DeleteAccountHolderInput
): Promise<DeleteAccountHolderOutput>

listPaymentMethods?(
  data: ListPaymentMethodsInput
): Promise<ListPaymentMethodsOutput>

savePaymentMethod?(
  data: SavePaymentMethodInput
): Promise<SavePaymentMethodOutput>

deletePaymentMethod?(
  data: DeletePaymentMethodInput
): Promise<DeletePaymentMethodOutput>
```

[`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:481-617`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L481-L617) [`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:658-748`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L658-L748)

Version additions:

- Account-holder creation/deletion and saved-method listing/saving: v2.5.x.
- `retrieveAccountHolder`: v2.11.0.
- `deletePaymentMethod`: v2.16.0.
- `pending_authorization`: added in the v2.19-era async-payment work, commit `b50a9dbaf3ee`. [`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:460-460`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L460) [`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:715-742`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L715-L742)

---

## 2. Input and return types

Import method types from:

```ts
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
```

### Common input

```ts
export type PaymentProviderContext = {
  account_holder?: PaymentAccountHolderDTO
  customer?: PaymentCustomerDTO
  idempotency_key?: string
}

export type PaymentProviderInput = {
  data?: Record<string, unknown>
  context?: PaymentProviderContext
}
```

`InitiatePaymentInput` and `UpdatePaymentInput` additionally require `amount: BigNumberInput` and `currency_code: string`; `RefundPaymentInput` requires `amount`; the other core input interfaces simply extend `PaymentProviderInput`. [`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:70-162`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L70-L162)

### Success outputs

```ts
type PaymentProviderOutput = {
  data?: Record<string, unknown>
}

interface InitiatePaymentOutput extends PaymentProviderOutput {
  id: string
  status?: PaymentSessionStatus
}

interface AuthorizePaymentOutput extends PaymentProviderOutput {
  status: PaymentSessionStatus
}

interface UpdatePaymentOutput extends PaymentProviderOutput {
  status?: PaymentSessionStatus
}

interface DeletePaymentOutput extends PaymentProviderOutput {}
interface CapturePaymentOutput extends PaymentProviderOutput {}
interface RefundPaymentOutput extends PaymentProviderOutput {}
interface RetrievePaymentOutput extends PaymentProviderOutput {}
interface CancelPaymentOutput extends PaymentProviderOutput {}

interface GetPaymentStatusOutput extends PaymentProviderOutput {
  status: PaymentSessionStatus
}
```

[`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:246-315`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L246-L315) [`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:381-389`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L381-L389)

### Errors: throw; do not return legacy error objects

Current v2.19 outputs contain only successful result shapes. Provider methods should reject/throw on failure. The base-class documentation repeatedly says “Throws in case of an error,” and the official Stripe provider throws errors from failed operations. [`medusajs/medusa@v2.19.0:packages/core/utils/src/payment/abstract-payment-provider.ts:177-178`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L177-L178) [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/core/stripe-base.ts:320-351`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/core/stripe-base.ts#L320-L351)

Use `MedusaError` when you want a controlled Medusa error type:

```ts
throw new MedusaError(
  MedusaError.Types.INVALID_DATA,
  "Required payment data is missing"
)
```

A plain `Error` is also valid for upstream-provider failures; Stripe’s `buildError` returns a plain `Error`. [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/core/stripe-base.ts:810-819`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/core/stripe-base.ts#L810-L819)

**Version warning:** v2.0.0 had:

```ts
interface PaymentProviderError {
  error: string
  code?: string
  detail?: any
}
```

and returned unions such as:

```ts
Promise<PaymentProviderError | PaymentProviderSessionResponse>
```

That contract is gone from current v2.19. Returning `{ error, code, detail }` from a current provider is wrong. [`medusajs/medusa@v2.0.0:packages/core/types/src/payment/provider.ts:156-174`](https://github.com/medusajs/medusa/blob/v2.0.0/packages/core/types/src/payment/provider.ts#L156-L174) [`medusajs/medusa@v2.0.0:packages/core/types/src/payment/provider.ts:218-254`](https://github.com/medusajs/medusa/blob/v2.0.0/packages/core/types/src/payment/provider.ts#L218-L254)

### PaymentSessionStatus

```ts
export enum PaymentSessionStatus {
  AUTHORIZED = "authorized",
  CAPTURED = "captured",
  PENDING = "pending",
  REQUIRES_MORE = "requires_more",
  ERROR = "error",
  CANCELED = "canceled",
  PENDING_AUTHORIZATION = "pending_authorization",
}
```

[`medusajs/medusa@v2.19.0:packages/core/utils/src/payment/payment-session.ts:1-36`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/payment-session.ts#L1-L36)

`authorizePayment` must normally return one of:

- `authorized`: create the internal `Payment`.
- `captured`: create the internal `Payment` and record it as already captured without calling the provider’s capture API again.
- `pending_authorization`: persist the session state, create no `Payment` yet, but allow asynchronous checkout/order creation.
- Any other status: persist the status/data and fail synchronous authorization. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:565-607`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L565-L607) [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:638-685`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L638-L685)

**Current source inconsistency:** the outer cart step contains special handling for `requires_more`, but `authorizePaymentSession` first persists that status and throws `MedusaError.Types.NOT_ALLOWED`; the outer step immediately rethrows existing `MedusaError`s. As written in v2.19/develop, a directly returned `requires_more` may therefore not reach the intended `PAYMENT_REQUIRES_MORE_ERROR` branch. Treat this as a current core issue and test your exact checkout path. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:591-606`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L591-L606) [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/payment/steps/authorize-payment-session.ts:52-99`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/payment/steps/authorize-payment-session.ts#L52-L99)

---

## 3. Identifier and registration

### Service

```ts
// src/providers/revolut/service.ts
import { AbstractPaymentProvider } from "@medusajs/framework/utils"

export type RevolutPaymentOptions = {
  apiKey: string
  webhookSecret: string
}

export default class RevolutPaymentProviderService
  extends AbstractPaymentProvider<RevolutPaymentOptions> {
  static identifier = "revolut"

  static validateOptions(options: RevolutPaymentOptions): void {
    if (!options.apiKey) {
      throw new Error("Revolut apiKey is required")
    }
  }

  // Implement the ten mandatory methods.
}
```

The static identifier is mandatory; provider registration rejects classes without it. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/loaders/providers.ts:16-26`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/loaders/providers.ts#L16-L26)

### Provider export

```ts
// src/providers/revolut/index.ts
import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import RevolutPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [RevolutPaymentProviderService],
})
```

This is the same structure used by the official Stripe provider. [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/index.ts:1-26`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/index.ts#L1-L26)

### Complete `medusa-config.ts`

```ts
import {
  defineConfig,
  loadEnv,
  Modules,
} from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },

  // Keep this if the package also ships API routes, workflows,
  // subscribers, or Admin extensions.
  plugins: [
    {
      resolve: "@acme/medusa-payment-revolut",
      options: {},
    },
  ],

  modules: [
    {
      key: Modules.PAYMENT,
      resolve: "@medusajs/payment",
      options: {
        webhook_delay: 5000,
        webhook_retries: 3,
        providers: [
          {
            resolve:
              "@acme/medusa-payment-revolut/providers/revolut",
            id: "revolut",
            options: {
              apiKey: process.env.REVOLUT_API_KEY!,
              webhookSecret: process.env.REVOLUT_WEBHOOK_SECRET!,
            },
          },
        ],
      },
    },
  ],
})
```

The direct package form `key: Modules.PAYMENT, resolve: "@medusajs/payment"` is used by Medusa’s integration configuration. The docs often use `resolve: "@medusajs/medusa/payment"` without `key`; that is also valid because `@medusajs/medusa/payment` re-exports `@medusajs/payment`. [`medusajs/medusa@v2.19.0:integration-tests/modules/medusa-config.ts:153-162`](https://github.com/medusajs/medusa/blob/v2.19.0/integration-tests/modules/medusa-config.ts#L153-L162) [`medusajs/medusa@v2.19.0:packages/medusa/src/modules/payment.ts:1-6`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/modules/payment.ts#L1-L6)

A pure provider package can be installed only through the Payment Module’s `providers` entry. Add the top-level `plugins` entry when the package also ships plugin-level API routes, workflows, subscribers, links, or Admin extensions; the Pay.nl plugin follows that combined pattern, while Mollie documents only the provider entry. [`webbersagency/pay-payments-medusa@main:README.md:166-202`](https://github.com/webbersagency/pay-payments-medusa/blob/main/README.md#L166-L202) [`VariableVic/mollie-payments-medusa@main:README.md:70-95`](https://github.com/VariableVic/mollie-payments-medusa/blob/main/README.md#L70-L95)

### Final IDs

The loader constructs:

```ts
const key = `pp_${klass.identifier}${
  pluginOptions.id ? `_${pluginOptions.id}` : ""
}`
```

Therefore:

```text
identifier = "revolut"
config id  = "revolut"

provider record/storefront ID = pp_revolut_revolut
webhook route suffix          = revolut_revolut
```

[`medusajs/medusa@v2.19.0:packages/modules/payment/src/loaders/providers.ts:16-34`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/loaders/providers.ts#L16-L34)

The loader calls `Service.validateOptions(provider.options)` and instantiates every service with `new Service(cradle, provider.options)`. All services exported by one module-provider receive the same configured options object. [`medusajs/medusa@v2.19.0:packages/core/modules-sdk/src/loaders/module-provider-loader.ts:68-96`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/modules-sdk/src/loaders/module-provider-loader.ts#L68-L96)

---

## 4. Payment-session lifecycle

### 1. List providers enabled for the region

```http
GET /store/payment-providers?region_id=reg_...
```

The route requires `region_id` and returns providers linked to that region. [`medusajs/medusa@v2.19.0:packages/medusa/src/api/store/payment-providers/route.ts:12-49`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/payment-providers/route.ts#L12-L49)

### 2. Create the cart’s payment collection

```http
POST /store/payment-collections
Content-Type: application/json

{
  "cart_id": "cart_..."
}
```

The workflow copies `cart.currency_code` and `cart.raw_total` into a new payment collection, then links it to the cart. [`medusajs/medusa@v2.19.0:packages/medusa/src/api/store/payment-collections/route.ts:13-49`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/payment-collections/route.ts#L13-L49) [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/cart/workflows/create-payment-collection-for-cart.ts:98-147`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/cart/workflows/create-payment-collection-for-cart.ts#L98-L147)

### 3. Initialize a payment session

```http
POST /store/payment-collections/paycol_.../payment-sessions
Content-Type: application/json

{
  "provider_id": "pp_revolut_revolut",
  "data": {}
}
```

The accepted body is exactly `provider_id: string` plus optional `data: Record<string, unknown>`. [`medusajs/medusa@v2.19.0:packages/medusa/src/api/store/payment-collections/validators.ts:9-17`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/payment-collections/validators.ts#L9-L17)

The route invokes `createPaymentSessionsWorkflow`; that workflow:

1. Retrieves collection amount/currency.
2. Optionally obtains/creates the customer’s provider account holder.
3. Builds the provider context.
4. Deletes the previous active payment session because split payment is currently unsupported.
5. Creates the new session. [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/payment-collection/workflows/create-payment-session.ts:73-208`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/payment-collection/workflows/create-payment-session.ts#L73-L208)

The Payment Module calls:

```ts
provider.initiatePayment({
  context: {
    idempotency_key: paymentSession.id,
    ...input.context,
  },
  data: {
    ...input.data,
    session_id: paymentSession.id,
  },
  amount: input.amount,
  currency_code: normalizeCurrencyCode(input.currency_code),
})
```

It then stores merged input/provider data and defaults status to `pending`. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:400-435`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L400-L435)

### Meaning and ownership of `data`

`PaymentSession.data` is provider-owned opaque JSON. Use it for an external payment/order ID, checkout URL, public client token, or other information needed by later provider calls and the storefront. It is returned to the storefront, so it must not contain secrets. [`medusajs/medusa@v2.19.0:packages/core/utils/src/payment/abstract-payment-provider.ts:337-347`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/abstract-payment-provider.ts#L337-L347)

Data flow:

```text
storefront data
    + Medusa's session_id
    + initiatePayment().data
        -> PaymentSession.data

PaymentSession.data
        -> authorizePayment(input.data)

authorizePayment().data
        -> Payment.data

Payment.data
        -> capturePayment / refundPayment / cancelPayment

each method's returned data
        -> updated Payment.data
```

The authorization-to-payment transition is implemented directly in the Payment Module. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:565-672`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L565-L672)

**Important implementation detail:** although `InitiatePaymentOutput.id` is required by the type, current `createPaymentSession` does not separately persist that field. It persists `providerPaymentSession.data` and `status`. Put the external payment ID inside `data` as well:

```ts
return {
  id: externalPayment.id,
  status: "pending",
  data: {
    id: externalPayment.id,
    checkout_url: externalPayment.checkout_url,
  },
}
```

[`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:258-270`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L258-L270) [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:415-433`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L415-L433)

### 4. Complete the cart and authorize

```http
POST /store/carts/cart_.../complete
```

`completeCartWorkflow` validates that at least one payment session is in a processable status, creates the order, and deliberately calls `authorizePaymentSessionStep` near the end. [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/cart/steps/validate-cart-payments.ts:45-80`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/cart/steps/validate-cart-payments.ts#L45-L80) [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/cart/workflows/complete-cart.ts:677-723`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/cart/workflows/complete-cart.ts#L677-L723)

The call chain is:

```text
POST /store/carts/:id/complete
  -> completeCartWorkflow
  -> authorizePaymentSessionStep
  -> paymentModule.authorizePaymentSession
  -> provider.authorizePayment
```

[`medusajs/medusa@v2.19.0:packages/medusa/src/api/store/carts/[id]/complete/route.ts:13-23`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/carts/%5Bid%5D/complete/route.ts#L13-L23) [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/payment/steps/authorize-payment-session.ts:39-56`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/payment/steps/authorize-payment-session.ts#L39-L56)

### 5. Capture

Manual capture uses:

```http
POST /admin/payments/pay_.../capture

{
  "amount": 1000
}
```

The route executes `capturePaymentWorkflow`, which calls the Payment Module and ultimately `provider.capturePayment`. [`medusajs/medusa@v2.19.0:packages/medusa/src/api/admin/payments/[id]/capture/route.ts:9-28`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/admin/payments/%5Bid%5D/capture/route.ts#L9-L28) [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/payment/workflows/capture-payment.ts:52-93`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/payment/workflows/capture-payment.ts#L52-L93)

Medusa supplies the capture record ID as `context.idempotency_key`. Refunds similarly receive the refund ID, cancellation receives the payment ID, and session initiation/authorization receive the payment-session ID. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:884-900`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L884-L900) [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:1058-1071`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L1058-L1071) [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:1089-1101`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L1089-L1101)

---

## 5. Webhooks

### Exact method and input

```ts
async getWebhookActionAndData(
  payload: ProviderWebhookPayload["payload"]
): Promise<WebhookActionResult>
```

```ts
interface ProviderWebhookPayload {
  provider: string
  payload: {
    data: Record<string, unknown>
    rawData: string | Buffer
    headers: Record<string, unknown>
  }
}
```

[`medusajs/medusa@v2.19.0:packages/core/types/src/payment/mutations.ts:334-362`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/mutations.ts#L334-L362)

### Result

```ts
type WebhookActionResult = {
  action: PaymentActions
  data?: {
    session_id: string
    amount: BigNumberValue
  }
}
```

[`medusajs/medusa@v2.19.0:packages/core/types/src/payment/provider.ts:391-425`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/types/src/payment/provider.ts#L391-L425)

The runtime enum is:

```ts
enum PaymentActions {
  AUTHORIZED = "authorized",
  SUCCESSFUL = "captured",
  FAILED = "failed",
  PENDING = "pending",
  REQUIRES_MORE = "requires_more",
  CANCELED = "canceled",
  NOT_SUPPORTED = "not_supported",
  PENDING_AUTHORIZATION = "pending_authorization",
}
```

Note the enum member is named `SUCCESSFUL`, not `CAPTURED`, although its value is `"captured"`. [`medusajs/medusa@v2.19.0:packages/core/utils/src/payment/webhook.ts:1-42`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/utils/src/payment/webhook.ts#L1-L42)

### URL

The built-in endpoint is:

```text
POST /hooks/payment/:provider
```

`:provider` is the final provider ID **without** the `pp_` prefix. For `pp_revolut_revolut`:

```text
/hooks/payment/revolut_revolut
```

The Payment Module prepends `pp_` before resolving the service. [`medusajs/medusa@v2.19.0:packages/medusa/src/api/hooks/payment/[provider]/route.ts:6-17`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/hooks/payment/%5Bprovider%5D/route.ts#L6-L17) [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:1455-1464`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L1455-L1464)

### Raw body

No additional configuration is required for the built-in payment-hook route. Medusa already applies:

```ts
{
  method: ["POST"],
  bodyParser: { preserveRawBody: true },
  matcher: "/hooks/payment/:provider",
}
```

The parser stores the original bytes in `req.rawBody`, and the route passes both parsed `req.body` and raw data to the provider. [`medusajs/medusa@v2.19.0:packages/medusa/src/api/hooks/middlewares.ts:1-9`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/hooks/middlewares.ts#L1-L9) [`medusajs/medusa@v2.19.0:packages/core/framework/src/http/middlewares/bodyparser.ts:18-49`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/framework/src/http/middlewares/bodyparser.ts#L18-L49)

The official Stripe provider verifies signatures using `rawData`, the provider-specific signature header, and its configured webhook secret. [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/core/stripe-base.ts:795-808`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/core/stripe-base.ts#L795-L808)

### Processing behavior

The route acknowledges with HTTP 200 after enqueueing `payment.webhook_received`; defaults are a 5-second delay and three attempts. [`medusajs/medusa@v2.19.0:packages/medusa/src/api/hooks/payment/[provider]/route.ts:19-37`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/hooks/payment/%5Bprovider%5D/route.ts#L19-L37)

Current core processing requires `data.session_id`; events without it are discarded. The built-in subscriber only forwards `"authorized"` and `"captured"` into `processPaymentWorkflow`; pending, pending-authorization, failed, canceled, requires-more, and unsupported events are currently ignored. [`medusajs/medusa@v2.19.0:packages/medusa/src/subscribers/payment-webhook.ts:28-62`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/subscribers/payment-webhook.ts#L28-L62)

For `"captured"`, Medusa captures an existing internal payment or creates/authorizes it first for auto-capture. For `"authorized"`, it authorizes the session; if a cart has no order yet, it also attempts cart completion. [`medusajs/medusa@v2.19.0:packages/core/core-flows/src/payment/workflows/process-payment.ts:112-226`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/core-flows/src/payment/workflows/process-payment.ts#L112-L226)

---

## 6. Storefront work

The JS SDK helper performs both REST calls when necessary:

```ts
await sdk.store.payment.initiatePaymentSession(cart, {
  provider_id: "pp_revolut_revolut",
  data: {},
})

const result = await sdk.store.cart.complete(cart.id)
```

`initiatePaymentSession` creates `/store/payment-collections` if the cart lacks one, then posts to `/store/payment-collections/:id/payment-sessions`. [`medusajs/medusa@v2.19.0:packages/core/js-sdk/src/store/index.ts:1162-1222`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/core/js-sdk/src/store/index.ts#L1162-L1222)

A provider-specific storefront normally must:

1. List region-enabled providers.
2. Initiate the chosen session.
3. Read `payment_session.data`.
4. Render the provider’s UI, redirect, or call its browser SDK.
5. After the browser-side provider action succeeds, call cart completion—or rely on a supported asynchronous webhook flow.
6. Check the complete response’s `type`; it may be `"order"` or `"cart"` with a payment error. [`medusajs/nextjs-starter-medusa@main:src/lib/data/payment.ts:7-34`](https://github.com/medusajs/nextjs-starter-medusa/blob/main/src/lib/data/payment.ts#L7-L34) [`medusajs/medusa@v2.19.0:packages/medusa/src/api/store/carts/[id]/complete/route.ts:34-85`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/carts/%5Bid%5D/complete/route.ts#L34-L85)

### No generic provider UI registry in the default starter

The current `nextjs-starter-medusa` hardcodes:

- Provider labels/icons in `paymentInfoMap`.
- `isStripeLike` and `isManual` predicates.
- Stripe-specific `Elements` wrapping and card input.
- A `PaymentButton` switch where unknown providers receive a disabled “Select a payment method” button. [`medusajs/nextjs-starter-medusa@main:src/lib/constants.tsx:8-51`](https://github.com/medusajs/nextjs-starter-medusa/blob/main/src/lib/constants.tsx#L8-L51) [`medusajs/nextjs-starter-medusa@main:src/modules/checkout/components/payment-wrapper/index.tsx:14-48`](https://github.com/medusajs/nextjs-starter-medusa/blob/main/src/modules/checkout/components/payment-wrapper/index.tsx#L14-L48) [`medusajs/nextjs-starter-medusa@main:src/modules/checkout/components/payment-button/index.tsx:27-44`](https://github.com/medusajs/nextjs-starter-medusa/blob/main/src/modules/checkout/components/payment-button/index.tsx#L27-L44)

So backend registration alone is insufficient. A new provider must add its label/icon, session UI or redirect logic, and completion button branch.

Another hidden constraint: the starter identifies the active session using only `status === "pending"` in its payment step, wrapper, and Stripe button. Providers relying on `requires_more` or `pending_authorization` need storefront changes rather than assuming the starter will continue rendering that session. [`medusajs/nextjs-starter-medusa@main:src/modules/checkout/components/payment/index.tsx:23-32`](https://github.com/medusajs/nextjs-starter-medusa/blob/main/src/modules/checkout/components/payment/index.tsx#L23-L32) [`medusajs/nextjs-starter-medusa@main:src/modules/checkout/components/payment-button/index.tsx:69-75`](https://github.com/medusajs/nextjs-starter-medusa/blob/main/src/modules/checkout/components/payment-button/index.tsx#L69-L75)

---

## 7. Plugin packaging

Plugin projects are supported from Medusa **v2.3.0** and can be scaffolded with:

```bash
npx create-medusa-app medusa-payment-revolut --plugin
```

[`medusajs/medusa@v2.19.0:www/apps/book/app/learn/fundamentals/plugins/create/page.mdx:13-29`](https://github.com/medusajs/medusa/blob/v2.19.0/www/apps/book/app/learn/fundamentals/plugins/create/page.mdx#L13-L29)

Use:

```text
src/
  providers/
    revolut/
      index.ts
      service.ts
      types.ts
```

The docs’ directory list currently says singular `src/provider`; that is inconsistent with its own required `./providers/*` export, the official plugin starter, and real plugins. Use plural `src/providers`. [`medusajs/medusa@v2.19.0:www/apps/book/app/learn/fundamentals/plugins/create/page.mdx:31-47`](https://github.com/medusajs/medusa/blob/v2.19.0/www/apps/book/app/learn/fundamentals/plugins/create/page.mdx#L31-L47) [`medusajs/medusa@v2.19.0:www/apps/book/app/learn/fundamentals/plugins/create/page.mdx:238-269`](https://github.com/medusajs/medusa/blob/v2.19.0/www/apps/book/app/learn/fundamentals/plugins/create/page.mdx#L238-L269)

Minimal relevant `package.json` fields:

```json
{
  "name": "@acme/medusa-payment-revolut",
  "version": "0.1.0",
  "files": [".medusa/server"],
  "exports": {
    "./package.json": "./package.json",
    "./providers/*": "./.medusa/server/src/providers/*/index.js",
    "./*": "./.medusa/server/src/*.js"
  },
  "keywords": [
    "medusa-v2",
    "medusa-plugin-integration",
    "medusa-plugin-payment"
  ],
  "scripts": {
    "build": "medusa plugin:build",
    "dev": "medusa plugin:develop",
    "prepublishOnly": "medusa plugin:build"
  },
  "devDependencies": {
    "@medusajs/cli": "2.19.0",
    "@medusajs/framework": "2.19.0",
    "@medusajs/medusa": "2.19.0",
    "@medusajs/test-utils": "2.19.0",
    "@swc/core": "^1.7.28",
    "typescript": "^5.6.2"
  },
  "peerDependencies": {
    "@medusajs/cli": "2.19.0",
    "@medusajs/framework": "2.19.0",
    "@medusajs/medusa": "2.19.0",
    "@medusajs/test-utils": "2.19.0"
  },
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  }
}
```

This is reduced from the current official plugin starter; retain Admin/UI dependencies only if the plugin actually ships Admin extensions. The official starter pins Medusa packages to matching versions in both `devDependencies` and `peerDependencies`. [`medusajs/medusa-starter-plugin@main:package.json:7-70`](https://github.com/medusajs/medusa-starter-plugin/blob/main/package.json#L7-L70)

Development/publishing commands:

```bash
npx medusa plugin:publish
npx medusa plugin:add @acme/medusa-payment-revolut
npx medusa plugin:develop

# production package
npx medusa plugin:build
npm publish
```

`plugin:build` generates `.medusa/server`; `plugin:develop` watches, builds, and republishes through Yalc. [`medusajs/medusa@v2.19.0:www/apps/book/app/learn/fundamentals/plugins/create/page.mdx:274-394`](https://github.com/medusajs/medusa/blob/v2.19.0/www/apps/book/app/learn/fundamentals/plugins/create/page.mdx#L274-L394) [`medusajs/medusa@v2.19.0:www/apps/book/app/learn/fundamentals/plugins/create/page.mdx:574-608`](https://github.com/medusajs/medusa/blob/v2.19.0/www/apps/book/app/learn/fundamentals/plugins/create/page.mdx#L574-L608)

---

## 8. Reference implementations and gotchas

### Official Stripe: authoritative implementation pattern

Stripe defines one shared `StripeBase` and multiple thin subclasses, each with its own `static identifier`; the provider `index.ts` exports all subclasses in one `services` array. This is the preferred pattern when one gateway exposes multiple payment methods. [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/core/stripe-base.ts:64-102`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/core/stripe-base.ts#L64-L102) [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/services/stripe-provider.ts:1-16`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/services/stripe-provider.ts#L1-L16) [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/index.ts:13-26`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/index.ts#L13-L26)

The official provider also demonstrates:

- External session ID stored in provider data.
- Medusa session ID copied into external metadata.
- Provider idempotency keys.
- Mapping external states to Medusa states.
- Signature verification from the raw body. [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/core/stripe-base.ts:266-306`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/core/stripe-base.ts#L266-L306) [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/core/stripe-base.ts:650-685`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/core/stripe-base.ts#L650-L685)

**Stripe docs discrepancy:** current source option names are camelCase (`automaticPaymentMethods`, `paymentDescription`, `paymentMethodConfiguration`, `oxxoExpiresDays`, `asyncPaymentMethodTypes`). Some rendered docs display snake_case names. Trust the TypeScript source. Also, `webhookSecret` is required by the interface, but runtime validation currently warns rather than throws when absent. [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/types/index.ts:3-40`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/types/index.ts#L3-L40) [`medusajs/medusa@v2.19.0:packages/modules/providers/payment-stripe/src/core/stripe-base.ts:69-87`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/providers/payment-stripe/src/core/stripe-base.ts#L69-L87)

### Community comparisons

- **Mollie** closely mirrors Stripe’s shared-base/multiple-service architecture and provides clear method/status/webhook examples, but it is pinned to Medusa 2.5.1 and predates `pending_authorization`, `retrieveAccountHolder`, and `deletePaymentMethod`. Use it as an architecture example, not the current contract authority. [`VariableVic/mollie-payments-medusa@main:package.json:28-72`](https://github.com/VariableVic/mollie-payments-medusa/blob/main/package.json#L28-L72) [`VariableVic/mollie-payments-medusa@main:src/providers/mollie/index.ts:1-25`](https://github.com/VariableVic/mollie-payments-medusa/blob/main/src/providers/mollie/index.ts#L1-L25)
- **MercadoPago** targets Medusa 2.16.0 and demonstrates when the provider contract is supplemented with custom store API routes/workflows for provider-specific browser payload creation. [`NicolasGorga/medusa-payment-mercadopago@master:package.json:34-75`](https://github.com/NicolasGorga/medusa-payment-mercadopago/blob/master/package.json#L34-L75) [`NicolasGorga/medusa-payment-mercadopago@master:src/providers/mercado-pago/service.ts:55-90`](https://github.com/NicolasGorga/medusa-payment-mercadopago/blob/master/src/providers/mercado-pago/service.ts#L55-L90)
- **Pay.nl** is the broadest current community example: many provider services, Admin/API/workflow extensions, explicit plugin plus provider registration, and direct webhook-signature/status tests. [`webbersagency/pay-payments-medusa@main:package.json:12-86`](https://github.com/webbersagency/pay-payments-medusa/blob/main/package.json#L12-L86) [`webbersagency/pay-payments-medusa@main:src/providers/pay/index.ts:1-6`](https://github.com/webbersagency/pay-payments-medusa/blob/main/src/providers/pay/index.ts#L1-L6) [`webbersagency/pay-payments-medusa@main:src/providers/pay/core/__tests__/get-webhook-action.spec.ts:56-100`](https://github.com/webbersagency/pay-payments-medusa/blob/main/src/providers/pay/core/__tests__/get-webhook-action.spec.ts#L56-L100)

### Operational gotchas

1. **Enable the provider in each region.** Registration creates/enables the provider record, but storefront listing is region-scoped. The Admin region form lists enabled provider records and stores selected provider IDs. [`medusajs/medusa@v2.19.0:packages/admin/dashboard/src/routes/regions/region-edit/components/edit-region-form/edit-region-form.tsx:47-77`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/admin/dashboard/src/routes/regions/region-edit/components/edit-region-form/edit-region-form.tsx#L47-L77)

2. **There is no provider display-name/logo contract.** Admin derives a label by splitting the provider ID; the Store API itself contains a TODO for names/logos. Add an Admin customization if richer presentation is required. [`medusajs/medusa@v2.19.0:packages/admin/dashboard/src/lib/format-provider.ts:1-17`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/admin/dashboard/src/lib/format-provider.ts#L1-L17) [`medusajs/medusa@v2.19.0:packages/medusa/src/api/store/payment-providers/route.ts:12-15`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/medusa/src/api/store/payment-providers/route.ts#L12-L15)

3. **Pure providers require no custom database model or migration.** Medusa owns `PaymentProvider`, `PaymentSession`, `Payment`, capture, and refund persistence, and upserts provider records during startup. Generate plugin migrations only if the plugin adds its own module/models. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/models/payment-provider.ts:1-12`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/models/payment-provider.ts#L1-L12) [`medusajs/medusa@v2.19.0:packages/modules/payment/src/loaders/providers.ts:92-120`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/loaders/providers.ts#L92-L120) [`medusajs/medusa@v2.19.0:www/apps/book/app/learn/fundamentals/plugins/create/page.mdx:446-480`](https://github.com/medusajs/medusa/blob/v2.19.0/www/apps/book/app/learn/fundamentals/plugins/create/page.mdx#L446-L480)

4. **Make external operations idempotent.** Medusa supplies stable IDs, but retries and webhook delivery can repeat calls. Persist enough external state in `data` to recognize already-created, canceled, captured, or refunded operations.

5. **Always preserve useful `data` in method returns.** Current module code writes returned provider data back to `PaymentSession.data` or `Payment.data`; returning the latest full provider state is the safest pattern. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:428-433`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L428-L433) [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:894-900`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L894-L900)

6. **Initialization rollback has a sharp edge.** If provider initiation succeeds but Medusa’s later database update fails, current core calls `deletePayment` with the original `input.data`, not `providerPaymentSession.data`. Design creation idempotently and do not assume rollback cleanup will receive the newly-created external ID. [`medusajs/medusa@v2.19.0:packages/modules/payment/src/services/payment-module.ts:436-450`](https://github.com/medusajs/medusa/blob/v2.19.0/packages/modules/payment/src/services/payment-module.ts#L436-L450)

7. **Minimum useful tests:** test every external-status mapping, idempotent replay, missing IDs, already-captured/canceled behavior, partial refund amounts, signature validation against exact raw bytes, unknown webhook events, and `session_id` correlation. The Pay.nl plugin’s webhook tests are a useful concrete pattern. [`webbersagency/pay-payments-medusa@main:src/providers/pay/core/__tests__/get-webhook-action.spec.ts:79-224`](https://github.com/webbersagency/pay-payments-medusa/blob/main/src/providers/pay/core/__tests__/get-webhook-action.spec.ts#L79-L224)

**Bottom line:** implement the ten current abstract methods, throw on errors, put the external ID in `data`, preserve Medusa’s injected `session_id`, return exact Medusa statuses, verify webhooks using `rawData`, export through `ModuleProvider`, enable the generated `pp_<identifier>_<id>` in a region, and explicitly add the provider’s frontend flow to the Next.js starter.
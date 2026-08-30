import { defineMiddlewares } from "@medusajs/framework/http"

// The signature is computed over the exact bytes received, so the raw body must survive
// JSON parsing. Medusa applies the same option to its own /hooks/payment/:provider route.
export default defineMiddlewares({
  routes: [
    {
      matcher: "/hooks/revolut",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
  ],
})

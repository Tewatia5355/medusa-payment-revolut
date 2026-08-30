import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import RevolutPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [RevolutPaymentProviderService],
})

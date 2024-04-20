import { JRGGSHandler } from "./define";
import { TicketViewHandler } from "./ticket-view";
import { UserViewHandler } from "./user-view";

export function getJRGGSHandler(handlerName: string): JRGGSHandler {
    if (handlerName === 'TicketView') { return new TicketViewHandler() }
    if (handlerName === 'UserView') { return new UserViewHandler() }
    return null    
}
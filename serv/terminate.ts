import { Server } from "http"
import { TelegramBotService } from './telegram/bot';

export default function terminate(server: Server, options = { coredump: false, timeout: 500 }) {
  return (code: number, reason: string) => (err: Error, rej: Promise<Error>) => {
    console.log(`Exit reason`, reason)
    if (err && err instanceof Error) {
      console.error(err)
    }

    if (rej) {
      console.error(rej)
    }

    const forceKill = setTimeout(() => {
      console.error(`[Terminate] Graceful shutdown timed out after ${options.timeout}ms — force killing`)
      process.exit(code)
    }, options.timeout)
    forceKill.unref()

    Promise.allSettled([
      TelegramBotService.stop(),
      new Promise<void>(resolve => server.close(() => resolve())),
    ]).then(() => {
      process.exit(code)
    })
  }
}

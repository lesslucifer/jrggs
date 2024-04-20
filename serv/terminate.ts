import { Server } from "http"

export default function terminate(server: Server, options = { coredump: false, timeout: 500 }) {
  const exit = (code?: number) => {
    if (options.coredump) {
      process.abort()
    }
    else {
      process.exit(code)
    }
  }

  return (code: number, reason: string) => (err: Error, rej: Promise<Error>) => {
    console.log(`Exit reason`, reason)
    if (err && err instanceof Error) {
      console.error(err)
    }

    if (rej) {
      console.error(rej)
    }

    setTimeout(() => exit(code), options.timeout)
    server.close((err) => console.log(err))
  }
}

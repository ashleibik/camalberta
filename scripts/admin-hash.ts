// npm run admin:hash: asks for the admin password (twice, nothing echoed)
// and prints its scrypt hash for ADMIN_PASSWORD_HASH. The password itself is
// never stored or printed. With input piped in (CI), hashes stdin instead.
import { hashPassword } from "@/lib/admin/password"

const MIN_LENGTH = 16

/** Reads one line from the terminal without echoing what's typed. */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stderr.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding("utf8")
    let value = ""
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off("data", onData)
          process.stderr.write("\n")
          resolve(value)
          return
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false)
          reject(new Error("cancelled"))
          return
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on("data", onData)
  })
}

async function readPiped(): Promise<string> {
  let text = ""
  for await (const chunk of process.stdin) text += chunk
  return text.replace(/\r?\n$/, "")
}

async function main(): Promise<number> {
  let password: string
  if (process.stdin.isTTY) {
    password = await askHidden("Admin password: ")
    const again = await askHidden("Again: ")
    if (password !== again) {
      console.error("The passwords don't match.")
      return 1
    }
  } else {
    password = await readPiped()
  }
  if (password.length < MIN_LENGTH) {
    console.error(`Use at least ${MIN_LENGTH} characters.`)
    return 1
  }
  const hash = await hashPassword(password)
  console.log(hash)
  if (process.stdin.isTTY) {
    // Next.js expands $NAME inside .env files, which would break the hash.
    console.error(
      [
        "",
        "Vercel: paste the line above as ADMIN_PASSWORD_HASH unchanged.",
        // Quotes don't help: only \$ escapes survive Next's expansion.
        "A .env file: write each $ as \\$, like this:",
        `ADMIN_PASSWORD_HASH=${hash.split("$").join("\\$")}`,
      ].join("\n")
    )
  }
  return 0
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Failed")
    process.exit(1)
  }
)

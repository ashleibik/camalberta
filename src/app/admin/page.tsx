import { redirect } from "next/navigation"

/** /admin itself has nothing; the proxy has already checked the login. */
export default function AdminPage() {
  redirect("/admin/label")
}

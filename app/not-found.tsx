import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth">
      <h1 className="large">Not found</h1>
      <p className="sub">That request doesn't exist, or you don't have access to it.</p>
      <Link className="btn" href="/">Go back</Link>
    </main>
  );
}

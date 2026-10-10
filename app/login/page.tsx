import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="auth">
      <h1 className="large">Studio Desk</h1>
      <p className="sub">Sign in with your work email.</p>
      <LoginForm
        initialError={
          error === "no-access"
            ? "That email doesn't have access yet. Ask Kingsley to add you."
            : error === "link"
              ? "That sign-in link has expired or was already used. Request a new one."
              : null
        }
      />
    </main>
  );
}

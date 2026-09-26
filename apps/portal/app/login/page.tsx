import { loginAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="login-screen">
      <form className="login-card" action={loginAction}>
        <p className="brand">ShadowAPI</p>
        <h1>Sign in</h1>
        <p className="muted">Customer workspace or platform admin, same page.</p>
        {params.error ? <p className="banner">Email or password did not match.</p> : null}
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit">Continue</button>
        <p className="muted">
          New customer? <a href="/signup">Create an account</a>
        </p>
      </form>
    </div>
  );
}

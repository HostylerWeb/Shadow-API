import { signupAction } from "../actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="login-screen">
    <form className="login-card" action={signupAction}>
      <p className="brand">ShadowAPI</p>
      <h1>Create an account</h1>
      <p className="muted">You will land in the portal and can teach your first endpoint from there.</p>
      {params.error === "1" ? <p className="banner">That email is already registered.</p> : null}
      {params.error === "2" ? <p className="banner">The account could not be created. Try again.</p> : null}
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={8} />
      </label>
      <label className="muted">
        <input name="author" type="checkbox" /> Advanced: graph repair tools (24 hours)
      </label>
      <button type="submit">Sign up</button>
      <p className="muted">
        Already registered? <a href="/login">Sign in</a>
      </p>
    </form>
    </div>
  );
}

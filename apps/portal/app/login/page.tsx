import { loginAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <form action={loginAction}>
      <h1>Sign in</h1>
      {params.error ? <p>Email or password did not match.</p> : null}
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" required />
      </label>
      <button type="submit">Sign in</button>
    </form>
  );
}

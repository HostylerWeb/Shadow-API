import { signupAction } from "../actions";

export default function SignupPage() {
  return (
    <form action={signupAction}>
      <h1>Create a tenant</h1>
      <p>This signs you into the portal. API keys are created afterward and used only from your server.</p>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={8} />
      </label>
      <label>
        <input name="author" type="checkbox" /> Author connectors (Studio)
      </label>
      <button type="submit">Sign up</button>
    </form>
  );
}

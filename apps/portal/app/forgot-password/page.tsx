import { forgotPasswordAction } from "../actions";

export default function ForgotPasswordPage() {
  return (
    <div className="login-screen">
      <form className="login-card" action={forgotPasswordAction}>
        <h1>Reset password</h1>
        <p className="muted">We will log a reset token in dev when SMTP_LOG_RESET=1.</p>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <button type="submit">Send reset link</button>
        <p className="muted"><a href="/login">Back to sign in</a></p>
      </form>
    </div>
  );
}

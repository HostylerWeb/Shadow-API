import { resetPasswordAction } from "../actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = params.token ?? "";
  return (
    <div className="login-screen">
      <form className="login-card" action={resetPasswordAction}>
        <h1>Choose a new password</h1>
        <input type="hidden" name="token" value={token} />
        <label>
          New password
          <input name="password" type="password" required minLength={8} />
        </label>
        <button type="submit">Update password</button>
      </form>
    </div>
  );
}

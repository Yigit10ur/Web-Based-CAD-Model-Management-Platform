import { signOut } from '@/auth';

export function SignOutButton({ email }: { email: string | null }) {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/sign-in' });
      }}
      className="flex items-center gap-2"
    >
      {email && <span className="text-xs text-slate-500">{email}</span>}
      <button type="submit" className="text-xs text-slate-500 hover:underline">
        sign out
      </button>
    </form>
  );
}

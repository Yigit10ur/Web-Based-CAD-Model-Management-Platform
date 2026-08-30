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
      {email && (
        <span className="hidden max-w-[16rem] truncate text-xs text-slate-400 sm:inline">
          {email}
        </span>
      )}
      <button
        type="submit"
        className="text-xs text-slate-500 transition-colors hover:text-slate-900"
      >
        sign out
      </button>
    </form>
  );
}

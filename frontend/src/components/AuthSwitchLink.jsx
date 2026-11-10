import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * The way across between the auth screens ("No account? Sign up", "Already
 * have one? Log in", "Remembered it? Back to login").
 *
 * It used to be a sentence with a small underlined link at the end of it,
 * which read as fine print: people looked for the other screen and did not see
 * a way to it. The sentence stays as the question, and the answer is a button
 * the width of the form, the same blue outline as the other secondary buttons.
 */
export default function AuthSwitchLink({ to, prompt, label }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-[15px]" style={{ color: '#a9b6d8' }}>{prompt}</p>
      <Link
        to={to}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#3a6bc4]/70 bg-[#3a6bc4]/10 px-5 text-[15px] font-semibold text-[#dbe6ff] transition hover:border-[#6b9bff] hover:bg-[#3a6bc4]/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b9bff]"
      >
        {label}
        <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
      </Link>
    </div>
  );
}

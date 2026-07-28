'use client';

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ProgressBar
        height="3px"
        color="#22d3ee" /* cyan-400 */
        options={{ showSpinner: false }}
        shallowRouting
      />
    </>
  );
}

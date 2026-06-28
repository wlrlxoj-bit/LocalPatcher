import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect root path to the default locale (ko)
  redirect('/ko');
}

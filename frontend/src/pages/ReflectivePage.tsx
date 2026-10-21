import AppHeader from '../components/AppHeader';
import ReflectiveCard from '../components/reflective/ReflectiveCard';

export default function ReflectivePage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main id="main" className="mx-auto flex max-w-6xl justify-center px-4 py-14">
        <ReflectiveCard />
      </main>
    </div>
  );
}

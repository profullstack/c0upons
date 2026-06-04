export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h1 className="text-3xl font-black text-gray-900">You&apos;re offline</h1>
      <p className="text-gray-500">Check your connection and try again.</p>
      <a href="/" className="bg-orange-500 text-white px-5 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors">
        Go home
      </a>
    </div>
  );
}

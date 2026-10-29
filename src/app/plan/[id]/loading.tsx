export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-rose border-r-transparent" />
        <p className="mt-4 font-serif text-sm font-medium text-plum">
          Loading celebration plan...
        </p>
      </div>
    </div>
  );
}


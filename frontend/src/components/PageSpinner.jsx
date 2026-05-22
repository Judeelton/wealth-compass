export default function PageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-50">
      <div
        className="w-8 h-8 rounded-full border-[3px] border-indigo-100 border-t-indigo-600 animate-spin"
        style={{ borderTopColor: '#4f46e5' }}
      />
    </div>
  )
}

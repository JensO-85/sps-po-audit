export default function DashboardHomePage() {
  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome</h2>
      <p className="text-sm text-gray-600">
        Upload SPS PO PDFs and a Buy Plan Excel using the{" "}
        <strong>Upload</strong> page, then run a comparison to see discrepancies
        in cost, quantity, description, and UOM.
      </p>
    </div>
  )
}

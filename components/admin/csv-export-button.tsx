'use client'

import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'

type CsvExportButtonProps<T extends Record<string, unknown>> = {
  rows: T[]
  filename: string
  label?: string
  columns?: Array<{ key: keyof T; header: string }>
}

function escapeCsvValue(value: unknown) {
  if (value == null) return ''
  const raw = String(value)
  const escaped = raw.replace(/"/g, '""')
  if (/[",\n]/.test(escaped)) return `"${escaped}"`
  return escaped
}

export function CsvExportButton<T extends Record<string, unknown>>({
  rows,
  filename,
  label = 'CSV',
  columns,
}: CsvExportButtonProps<T>) {
  const handleExport = () => {
    if (rows.length === 0) return

    const resolvedColumns =
      columns && columns.length > 0
        ? columns
        : (Object.keys(rows[0]) as Array<keyof T>).map((key) => ({ key, header: String(key) }))

    const headerRow = resolvedColumns.map((col) => escapeCsvValue(col.header)).join(',')
    const dataRows = rows.map((row) =>
      resolvedColumns.map((col) => escapeCsvValue(row[col.key])).join(',')
    )

    const csv = [headerRow, ...dataRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
      <FileSpreadsheet className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}

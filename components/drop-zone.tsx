"use client"

import { useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface DropZoneProps {
  onFiles: (files: File[]) => void
  accept: string
  multiple?: boolean
  label: string
  sublabel?: string
  disabled?: boolean
}

export function DropZone({
  onFiles,
  accept,
  multiple,
  label,
  sublabel,
  disabled,
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) onFiles(files)
    e.target.value = "" // allow re-selecting the same file
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors select-none",
        disabled
          ? "border-gray-200 bg-gray-50 cursor-default"
          : dragging
            ? "border-blue-400 bg-blue-50 cursor-pointer"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50 cursor-pointer"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <p className={cn("text-sm font-medium", disabled ? "text-gray-400" : "text-gray-700")}>
        {label}
      </p>
      {sublabel && (
        <p className={cn("text-xs mt-1", disabled ? "text-gray-300" : "text-gray-500")}>
          {sublabel}
        </p>
      )}
    </div>
  )
}

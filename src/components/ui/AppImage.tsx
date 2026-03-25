"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface AppImageProps {
  src?: string | null
  alt: string
  fill?: boolean
  width?: number
  height?: number
  sizes?: string
  priority?: boolean
  className?: string
  objectPosition?: "top" | "center" | "bottom" | "left" | "right" | string
  "data-ai-hint"?: string
  aiHint?: string
  fallbackSrc?: string
  loading?: "eager" | "lazy"
  onError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void
  unoptimized?: boolean
}

export default function AppImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  priority = false,
  className,
  objectPosition = "center",
  "data-ai-hint": aiHintData,
  aiHint,
  fallbackSrc,
  loading,
  onError,
  unoptimized
}: AppImageProps) {

  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const isDefaultImage = !src || error
  const imageSrc = isDefaultImage ? (fallbackSrc || "/default-image.png") : src

  const handleOnError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setError(true);
    if (onError) onError(e);
  };

  return (
    <div className={cn("relative overflow-hidden", fill ? "w-full h-full" : "inline-block", className)}>

      {!loaded && (
        <Image
          src="/default-image.png"
          alt="loading placeholder"
          fill={fill}
          width={!fill ? width : undefined}
          height={!fill ? height : undefined}
          sizes={
  sizes ||
  (fill
    ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    : undefined)
}
          className="object-contain animate-pulse bg-muted"
        />
      )}

      <Image
        src={imageSrc}
        alt={alt}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        sizes={
  sizes ||
  (fill
    ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    : undefined)
}
        priority={priority}
        loading={loading}
        onLoad={() => setLoaded(true)}
        onError={handleOnError}
        data-ai-hint={aiHint || aiHintData}
        unoptimized={unoptimized}
        className={cn(
          "transition-opacity duration-300",
          isDefaultImage ? "object-contain bg-muted" : "object-cover",
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={{ objectPosition }}
      />

    </div>
  )
}
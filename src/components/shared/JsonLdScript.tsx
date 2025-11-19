
"use client";

import Script from 'next/script';

interface JsonLdScriptProps {
  data: Record<string, any>;
  idSuffix?: string; // To make ID more unique if multiple on page
}

const JsonLdScript: React.FC<JsonLdScriptProps> = ({ data, idSuffix }) => {
  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  // Generate a base ID, make it more unique if suffix is provided
  const baseId = `json-ld-${data['@type']?.toLowerCase().replace(/[^a-z0-9]/gi, '') || 'data'}`;
  const scriptId = idSuffix ? `${baseId}-${idSuffix}` : `${baseId}-${Math.random().toString(36).substring(2, 7)}`;


  return (
    <Script
      id={scriptId}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      strategy="afterInteractive" // Or "lazyOnload"
    />
  );
};

export default JsonLdScript;

    
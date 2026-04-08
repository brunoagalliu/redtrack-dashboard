import { useState } from 'react';

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
      className={`shrink-0 px-3 py-2 text-xs rounded border font-medium transition-colors ${
        copied
          ? 'border-green-300 text-green-700 bg-green-50'
          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/**
 * Utility functions for markdown rendering
 */

import React from 'react';

export const markdownToBasicHtml = (text) => {
  if (!text) return '';
  let html = String(text);
  // Convert markdown-style bold **text** to <strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Convert markdown-style italic *text* to <em>
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Convert markdown-style code `text` to <code>
  html = html.replace(/`(.*?)`/g, '<code class="bg-black/30 px-1 rounded">$1</code>');
  // Convert line breaks
  html = html.replace(/\n\n/g, '</p><p class="my-2">');
  html = html.replace(/\n/g, '<br/>');
  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }
  return html;
};

export const renderMarkdown = (text) => {
  if (!text) return null;
  const html = markdownToBasicHtml(text);
  return React.createElement('div', { dangerouslySetInnerHTML: { __html: html } });
};

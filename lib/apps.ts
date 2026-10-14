// Apps: small tools made for one client business (supabase/migrations/028_apps.sql).
// Everything here is plain functions so the browser can use them to recolour and save a pattern.

export type App = {
  id: string;
  workspace_id: string;
  business_id: string;
  kind: AppKind;
  name: string;
  source_path: string | null;
  // The part of the pattern a background shows, in the SVG's own units, saved at one pixel per
  // unit. Without one, the whole drawing is saved EXPORT_WIDTH pixels wide.
  frame: Frame | null;
  created_at: string;
};

// pattern: recolour a one-colour SVG into backgrounds. model: a gallery of STL models to view in 3D.
export type AppKind = "pattern" | "model";
export const KIND_LABEL: Record<AppKind, string> = { pattern: "Pattern backgrounds", model: "3D viewer" };

export type AppModel = {
  id: string;
  app_id: string;
  name: string;
  file_path: string;
  thumb_path: string | null;
  size_bytes: number;
  triangles: number;
  created_by: string;
  created_at: string;
};

// The apps bucket takes files up to this size (migration 033), the free plan's limit.
export const MODEL_MAX_MB = 50;

// "4.2 MB" from a number of bytes.
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export type Frame = { x: number; y: number; w: number; h: number };

export type AppBackground = {
  id: string;
  app_id: string;
  name: string;
  pattern_color: string;
  background_color: string;
  image_path: string;
  thumb_path: string;
  svg_path: string;
  created_by: string;
  created_at: string;
};

// Saved backgrounds are this wide; the height follows the pattern's own shape.
export const EXPORT_WIDTH = 2160;
export const THUMB_WIDTH = 480;

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

// The pattern's drawing area, from its viewBox (or width and height when there isn't one).
export function svgBox(svg: string) {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const vb = root.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const num = (k: string) => Number(root.match(new RegExp(`\\b${k}\\s*=\\s*["']([\\d.]+)`, "i"))?.[1]);
  const w = num("width");
  const h = num("height");
  return { x: 0, y: 0, w: w > 0 ? w : 1000, h: h > 0 ? h : 1000 };
}

// The area a background shows and the pixel size it's saved at.
export function area(svg: string, frame: Frame | null) {
  const box = frame ?? svgBox(svg);
  const width = frame ? Math.round(frame.w) : EXPORT_WIDTH;
  return { box, width, height: Math.round((width * box.h) / box.w) };
}

// Takes out anything that could run or load from elsewhere, so an uploaded SVG is only a drawing.
export function cleanSvg(svg: string) {
  return svg
    .replace(/<\?xml[^>]*>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(href\s*=\s*["'])(?!#)[^"']*(["'])/gi, "$1#$2")
    .trim();
}

// The pattern in new colours: every line and shape colour becomes the pattern colour, and a
// background fills the area behind it. Cropped to the frame when there is one, and sized in pixels
// when width is given, for drawing onto a canvas.
export function recolour(svg: string, pattern: string, background: string, frame: Frame | null, width?: number) {
  const box = frame ?? svgBox(svg);
  const colour = /(?<!url\()#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
  const out = cleanSvg(svg)
    // Colours inside the <style> block and style="..." attributes.
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (s) => s.replace(colour, pattern))
    .replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_, s: string) => `style="${s.replace(colour, pattern)}"`)
    // Colour attributes; "none" stays none.
    .replace(/\b(fill|stroke)\s*=\s*"(?!none")[^"]*"/gi, `$1="${pattern}"`);
  const rect = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${background}"/>`;
  return crop(out, box, width).replace(/<svg\b[^>]*>/i, (tag) => tag + rect);
}

// Shows only the given area of the drawing, at a pixel size when width is given.
export function crop(svg: string, box: Frame, width?: number) {
  return svg.replace(/<svg\b[^>]*>/i, (tag) => {
    let t = tag.replace(/\s(width|height|viewBox)\s*=\s*["'][^"']*["']/gi, "").replace(/\s*\/?>$/, "");
    t += ` viewBox="${box.x} ${box.y} ${box.w} ${box.h}"`;
    if (width) t += ` width="${width}" height="${Math.round((width * box.h) / box.w)}"`;
    return `${t}>`;
  });
}

// A short name from the two colours, used when none is typed.
export function colourName(pattern: string, background: string) {
  return `${pattern.toUpperCase()} on ${background.toUpperCase()}`;
}

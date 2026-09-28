import type { ImgHTMLAttributes } from 'react';

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  width?: number;
  height?: number;
};

/**
 * Performance-focused image primitive.
 *
 * - width/height reduce layout shift when supplied.
 * - lazy loading keeps below-the-fold assets out of the initial request path.
 * - async decoding prevents image decode work from blocking rendering.
 * - sizes tells the browser how much viewport space the image needs.
 *
 * If the asset pipeline later creates 480/768/1024/1440px variants,
 * add a srcSet to this component (or pass one through the normal img props).
 */
export default function OptimizedImage({
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'low',
  width,
  height,
  sizes = '100vw',
  ...props
}: Props) {
  return (
    <img
      {...props}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      sizes={sizes}
    />
  );
}

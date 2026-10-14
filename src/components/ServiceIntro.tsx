import OptimizedImage from './OptimizedImage';
import { LocalizedTree } from '../context/LanguageContext';

export default function ServiceIntro({
  image,
  label,
  title,
  body
}: {
  image: string;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <LocalizedTree>
      <section className={`service-intro service-intro--${image}`} aria-label={label}>
        <div>
          <p>{label}</p>
          <h2>{title}</h2>
          <span>{body}</span>
        </div>
        <OptimizedImage
          src={`/facilities/responsive/${image}-1280.webp`}
          srcSet={`/facilities/responsive/${image}-640.webp 640w, /facilities/responsive/${image}-1280.webp 1280w`}
          sizes="(min-width: 768px) 40vw, 100vw"
          alt=""
          width={1280}
          height={960}
        />
      </section>
    </LocalizedTree>
  );
}

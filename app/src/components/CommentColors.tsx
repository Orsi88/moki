// Accessible color names and swatches shared by document comments.
import { t } from '../i18n';
import { COLORS, SWATCH, type CommentColor } from '../md-comments';

export const colorName = (c: string) => ({ yellow: t('Yellow'), green: t('Green'), blue: t('Blue'), pink: t('Pink'), orange: t('Orange'), red: t('Red'), purple: t('Purple') })[c] ?? c;

export function CommentColors({ value, onChange, disabled = false }: { value?: CommentColor; onChange: (color: CommentColor) => void; disabled?: boolean }) {
  return <div className="pdf-colors" role="radiogroup" aria-label={t('Comment color')}>
    {COLORS.map((color) => <button key={color} type="button" role="radio" aria-checked={value === color} className={`pdf-color${value === color ? ' on' : ''}`}
      title={colorName(color)} aria-label={colorName(color)} style={{ background: SWATCH[color] }} disabled={disabled} onClick={() => onChange(color)} />)}
  </div>;
}

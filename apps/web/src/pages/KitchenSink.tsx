import { Chip, GameCard, PositionBadge, RankRow } from '../components/ui';

/**
 * Espejo del artboard 06. Sirve para comparar la implementación contra el canvas
 * de un vistazo, y como referencia viva al construir las pantallas reales (T0.8).
 */
export default function KitchenSink() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 80px' }}>
      <p className="lj-label" style={{ marginBottom: 8 }}>Liga de Juegos · sistema</p>
      <h1 className="lj-display" style={{ fontSize: 52, margin: '0 0 32px' }}>Kitchen sink</h1>

      <Section title="Paleta y roles">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {SWATCHES.map((s) => (
            <div key={s.hex} className="lj-card" style={{ display: 'flex', gap: 10, padding: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 34, height: 34, flex: '0 0 34px', background: s.hex, border: '1px solid #DDD6C8' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <code className="lj-t" style={{ fontSize: 12 }}>{s.hex}</code>
                <span style={{ fontSize: 11, color: '#6B6357', lineHeight: 1.5 }}>{s.role}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Escala tipográfica">
        <div className="lj-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Specimen note="Display · Newsreader 600 · 52px · tracking −0.04em">
            <span className="lj-display" style={{ fontSize: 52 }}>4º · 47:21</span>
          </Specimen>
          <Specimen note="Título de card · Newsreader 600 · 26px">
            <span className="lj-card-title" style={{ fontSize: 26 }}>Todavía no cargaste lo de hoy</span>
          </Specimen>
          <Specimen note="Tiempos · IBM Plex Mono 600 · cifras tabulares">
            <span className="lj-t" style={{ fontSize: 24 }}>06:41 · 12:03 · 45:00</span>
          </Specimen>
          <Specimen note="UI fuerte · Archivo 600 · 15px">
            <span style={{ fontSize: 15, fontWeight: 600 }}>Nacho · Cruci Experto</span>
          </Specimen>
          <Specimen note="Cuerpo · Archivo 400 · 13–15px · interlineado 1.7">
            <span style={{ fontSize: 14, lineHeight: 1.7, color: '#4A4438' }}>
              Cuerpo. Interlineado holgado para el copy que explica.
            </span>
          </Specimen>
          <Specimen note="Etiqueta · IBM Plex Mono · 10px · tracking .16em">
            <span className="lj-label">Podio de hoy</span>
          </Specimen>
        </div>
      </Section>

      <Section title="Fila de ranking · 4 variantes">
        <div className="lj-card">
          <RankRow variant="leader" position={1} initials="SF" name="Líder" total="41:12" />
          <RankRow position={2} initials="NA" name="Normal" total="44:38" />
          <RankRow variant="me" position={3} initials="VC" name="Mi fila" total="47:21" />
          <RankRow variant="idle" position={8} initials="LU" name="Sin cargar hoy" total="—" />
        </div>
      </Section>

      <Section title="Card de juego en la carga · 3 estados">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <GameCard label="Vacío" value="--:--" />
          <GameCard label="Con foco" value="06:41" state="focus" />
          <GameCard label="DNF" value="45:00" state="dnf" />
        </div>
      </Section>

      <Section title="Chips de estado">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Chip kind="verified">VERIFICADO</Chip>
          <Chip kind="manual">A mano</Chip>
          <Chip kind="dnf">2 DNF</Chip>
          <Chip kind="streak">3 días ▲</Chip>
          <Chip kind="wins">5 victorias</Chip>
        </div>
        <p style={{ fontSize: 12, color: '#6B6357', lineHeight: 1.6, marginTop: 10, maxWidth: 560 }}>
          El sello ✓ es la única marca de verificado y aparece igual en home, ranking y detalle. Lo tipeado a mano no
          lleva alerta: lleva un contorno punteado neutro.
        </p>
      </Section>

      <Section title="Badge de posición · Botones">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <PositionBadge position={1} />
          <PositionBadge position={2} />
          <PositionBadge position={7} />
          <PositionBadge position={null} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" className="btn btn-primary">Primario</button>
          <button type="button" className="btn btn-outline-dark">Secundario</button>
          <button type="button" className="btn btn-primary" disabled>Deshabilitado</button>
        </div>
        <p style={{ fontSize: 12, color: '#6B6357', lineHeight: 1.6, marginTop: 10 }}>
          Hover y foco son estados reales: pasá el mouse o tabulá. El anillo ámbar no se remueve nunca.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 className="lj-card-title" style={{ fontSize: 20, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  );
}

function Specimen({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderBottom: '1px solid #EDE7DA', paddingBottom: 12 }}>
      {children}
      <span style={{ fontSize: 11, color: '#6B6357' }}>{note}</span>
    </div>
  );
}

const SWATCHES = [
  { hex: '#16513C', role: '$primary · CTA, mi fila, líder, links' },
  { hex: '#0F3D2D', role: 'Hover / active del primary' },
  { hex: '#A8352A', role: '$danger · sólo DNF y errores' },
  { hex: '#C9A227', role: 'Ámbar de foco' },
  { hex: '#14120E', role: 'Tinta · texto y reglas fuertes' },
  { hex: '#4A4438', role: 'Texto secundario' },
  { hex: '#6B6357', role: 'Etiquetas y metadatos' },
  { hex: '#DDD6C8', role: 'Regla fina · bordes de 1px' },
  { hex: '#F1EBDD', role: 'Encabezados de tabla y barra inferior' },
  { hex: '#F6F2EA', role: 'Papel · fondo de la app' },
  { hex: '#FFFFFF', role: 'Superficie de card' },
];

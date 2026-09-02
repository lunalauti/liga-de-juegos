import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { initialsOf, type GroupSettings } from '@liga/shared';
import { useMe } from '../hooks/useMe';
import { useActiveGroup } from '../hooks/useActiveGroup';
import { apiFetch, ApiClientError } from '../api/client';
import type { MyGroup } from '../hooks/useMe';

/**
 * Artboard 04 · "Grupo": eyebrow + título, código de invitación grande con copiar y
 * compartir por WhatsApp, miembros, palmarés. Ver specs/02-design.md §6.2 y §9 del canvas.
 */
export default function Grupo() {
  const { me, loading, error, refetch, token } = useMe();
  const { activeGroup, selectGroup } = useActiveGroup(me?.groups);

  if (loading) return <Screen><p style={{ color: '#6B6357' }}>Cargando…</p></Screen>;
  if (error) return <Screen><p role="alert" style={{ color: '#A8352A' }}>{error}</p></Screen>;

  if (!me || me.groups.length === 0) {
    return (
      <Screen>
        <Eyebrow>Liga de Juegos</Eyebrow>
        <h1 className="lj-display" style={{ fontSize: 34, margin: '10px 0 8px' }}>La tabla arranca vacía</h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4A4438', margin: '0 0 24px' }}>
          Todavía no sos parte de ningún grupo. Creá uno o pedí el código de invitación de tus amigos.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to="/grupo/nuevo">Crear grupo</Link>
          <Link className="btn btn-outline-dark" to="/unirse">Unirme con un código</Link>
        </div>
      </Screen>
    );
  }

  if (!activeGroup) return <Screen><p style={{ color: '#6B6357' }}>Cargando…</p></Screen>;

  return (
    <Screen>
      {me.groups.length > 1 && (
        <select
          aria-label="Cambiar de grupo"
          className="form-select"
          value={activeGroup.id}
          onChange={(e) => selectGroup(e.target.value)}
          style={{ marginBottom: 14, maxWidth: 260 }}
        >
          {me.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}

      <GroupDetail group={activeGroup} token={token} onChanged={refetch} />

      <div style={{ marginTop: 20, display: 'flex', gap: 16 }}>
        <Link to="/grupo/nuevo" style={{ fontSize: 13, color: '#16513C', fontWeight: 600 }}>+ Crear otro grupo</Link>
        <Link to="/unirse" style={{ fontSize: 13, color: '#16513C', fontWeight: 600 }}>Unirme a otro</Link>
      </div>
    </Screen>
  );
}

interface GroupDetailData {
  id: string;
  name: string;
  createdAt: string;
  inviteCode: string;
  members: { userId: string; displayName: string; avatar: string | null; role: string }[];
  settings: GroupSettings;
}

function GroupDetail({ group, token, onChanged }: { group: MyGroup; token: string | undefined; onChanged: () => void }) {
  const [detail, setDetail] = useState<GroupDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [copyLabel, setCopyLabel] = useState('Copiar');
  const [reloadTick, setReloadTick] = useState(0);

  // Se recarga cada vez que cambia el grupo activo o se pide un refetch explícito.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingDetail(true);
    apiFetch<GroupDetailData>(`/groups/${group.id}`, { accessToken: token })
      .then((d) => !cancelled && setDetail(d))
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => {
      cancelled = true;
    };
  }, [group.id, token, reloadTick]);

  const since = detail ? formatSince(detail.createdAt) : '';

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setCopyLabel('Copiado');
      setTimeout(() => setCopyLabel('Copiar'), 1500);
    } catch {
      setCopyLabel('No se pudo copiar');
    }
  }

  function shareWhatsapp() {
    const text = `Dale, sumate a "${group.name}" en Liga de Juegos. Código: ${group.inviteCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <div style={{ paddingBottom: 12, borderBottom: '1.5px solid #14120E', marginBottom: 16 }}>
        <p className="lj-label" style={{ margin: 0 }}>Grupo{since ? ` · ${since}` : ''}</p>
        <h1 className="lj-card-title" style={{ fontSize: 26, margin: '2px 0 0' }}>{group.name}</h1>
      </div>

      <div className="lj-card" style={{ padding: 12, marginBottom: 14 }}>
        <p className="lj-label" style={{ marginBottom: 6 }}>Código de invitación</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span className="lj-t" style={{ fontSize: 29, letterSpacing: '.06em' }}>{group.inviteCode}</span>
          <button type="button" onClick={copyCode} className="btn btn-outline-dark" style={{ height: 36, padding: '0 12px', fontSize: 13 }}>
            {copyLabel}
          </button>
        </div>
        <button type="button" onClick={shareWhatsapp} className="btn btn-primary" style={{ marginTop: 10, width: '100%', height: 46 }}>
          Compartir por WhatsApp
        </button>
      </div>

      <div className="lj-card" style={{ marginBottom: 14 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #DDD6C8', background: '#F1EBDD', display: 'flex', justifyContent: 'space-between' }}>
          <span className="lj-label" style={{ color: '#4A4438' }}>Miembros</span>
          <span className="lj-label">{detail?.members.length ?? '…'}</span>
        </div>
        {loadingDetail && <p style={{ padding: 14, color: '#6B6357', fontSize: 13, margin: 0 }}>Cargando…</p>}
        {detail?.members.map((m, i) => (
          <div
            key={m.userId}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < detail.members.length - 1 ? '1px solid #EDE7DA' : 'none' }}
          >
            <span className="lj-avatar">{m.avatar ?? initialsOf(m.displayName)}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{m.displayName}</span>
            {m.role === 'admin' && <span className="lj-label" style={{ color: '#8C8271' }}>admin</span>}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: '#6B6357', lineHeight: 1.6 }}>
        El palmarés se arma con la primera temporada cerrada del grupo.
      </p>

      {group.role === 'admin' && (
        <GroupSettingsPanel
          groupId={group.id}
          groupName={group.name}
          token={token}
          settings={detail?.settings}
          onSaved={() => {
            onChanged();
            setReloadTick((n) => n + 1);
          }}
          onDeleted={onChanged}
        />
      )}
    </>
  );
}

function GroupSettingsPanel({
  groupId,
  groupName,
  token,
  settings,
  onSaved,
  onDeleted,
}: {
  groupId: string;
  groupName: string;
  token: string | undefined;
  settings: GroupSettings | undefined;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 20 }}>
      <button type="button" className="btn btn-outline-dark" style={{ width: '100%' }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Cerrar ajustes' : 'Ajustes del grupo (admin)'}
      </button>
      {open && (
        <>
          <GroupSettingsForm groupId={groupId} token={token} settings={settings} onSaved={onSaved} />
          <DeleteGroupSection groupId={groupId} groupName={groupName} token={token} onDeleted={onDeleted} />
        </>
      )}
    </div>
  );
}

function DeleteGroupSection({
  groupId,
  groupName,
  token,
  onDeleted,
}: {
  groupId: string;
  groupName: string;
  token: string | undefined;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!token) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/groups/${groupId}`, {
        method: 'DELETE',
        accessToken: token,
        body: { confirmName: typedName },
      });
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No pudimos borrar el grupo');
      setDeleting(false);
    }
  }

  return (
    <div className="lj-card" style={{ padding: 14, marginTop: 14, border: '1.5px solid #A8352A' }}>
      <p className="lj-label" style={{ color: '#A8352A', marginBottom: 6 }}>Zona de peligro</p>
      {!confirming ? (
        <button
          type="button"
          className="btn"
          style={{ width: '100%', color: '#A8352A', borderColor: '#A8352A', borderWidth: 1.5, borderStyle: 'solid' }}
          onClick={() => setConfirming(true)}
        >
          Borrar grupo
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: '#4A4438', margin: 0 }}>
            Esto borra el grupo para siempre: miembros, tiempos cargados, temporadas y ranking. No se puede deshacer.
            Escribí <strong>{groupName}</strong> para confirmar.
          </p>
          <input
            type="text"
            className="form-control"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={groupName}
          />
          {error && <p role="alert" style={{ fontSize: 13, color: '#A8352A', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-outline-dark"
              style={{ flex: 1 }}
              onClick={() => {
                setConfirming(false);
                setTypedName('');
                setError(null);
              }}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1, background: '#A8352A', color: '#fff', borderColor: '#A8352A' }}
              onClick={() => void confirmDelete()}
              disabled={deleting || typedName !== groupName}
            >
              {deleting ? 'Borrando…' : 'Borrar para siempre'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupSettingsForm({
  groupId,
  token,
  settings,
  onSaved,
}: {
  groupId: string;
  token: string | undefined;
  settings: GroupSettings | undefined;
  onSaved: () => void;
}) {
  const [dropWorstN, setDropWorstN] = useState(0);
  const [absencePolicy, setAbsencePolicy] = useState<'penalize' | 'ignore'>('penalize');
  const [scoringMode, setScoringMode] = useState<'total_time' | 'position_points'>('total_time');
  const [requireVerified, setRequireVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Bug real encontrado probando en producción: este form arrancaba SIEMPRE en
  // los defaults hardcodeados, nunca en lo que el grupo tenía guardado — "Guardar"
  // sin tocar cada campo pisaba en silencio cualquier ajuste ya hecho (ej. abrir
  // el panel sólo para cambiar el modo de puntuación resetaba drop_worst_n a 0).
  // Sincroniza con lo que realmente devuelve la API, no con un default fijo.
  useEffect(() => {
    if (!settings) return;
    setDropWorstN(settings.drop_worst_n);
    setAbsencePolicy(settings.absence_policy);
    setScoringMode(settings.scoring_mode);
    setRequireVerified(settings.require_verified);
  }, [settings]);

  async function save() {
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/groups/${groupId}`, {
        method: 'PATCH',
        accessToken: token,
        body: {
          settings: {
            drop_worst_n: dropWorstN,
            absence_policy: absencePolicy,
            scoring_mode: scoringMode,
            require_verified: requireVerified,
          },
        },
      });
      setMsg('Guardado. Se aplica a la temporada en curso.');
      onSaved();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : 'No pudimos guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lj-card" style={{ padding: 14, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Trato de ausencias</span>
        <select className="form-select" value={absencePolicy} onChange={(e) => setAbsencePolicy(e.target.value as typeof absencePolicy)}>
          <option value="penalize">Penalizar (como un DNF)</option>
          <option value="ignore">Ignorar</option>
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Modo de puntuación</span>
        <select className="form-select" value={scoringMode} onChange={(e) => setScoringMode(e.target.value as typeof scoringMode)}>
          <option value="total_time">Tiempo total</option>
          <option value="position_points">Puntos por posición</option>
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Descartar los N peores días</span>
        <input
          type="number"
          className="form-control"
          min={0}
          max={5}
          value={dropWorstN}
          onChange={(e) => setDropWorstN(Number(e.target.value))}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={requireVerified} onChange={(e) => setRequireVerified(e.target.checked)} />
        Sólo cuentan los tiempos verificados (con link de La Nación)
      </label>

      {msg && <p role="status" style={{ fontSize: 13, color: '#16513C', margin: 0 }}>{msg}</p>}
      <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar ajustes'}
      </button>
    </div>
  );
}


function formatSince(iso: string): string {
  const d = new Date(iso);
  return `desde ${d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`;
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 420, margin: '0 auto', padding: '28px 20px 40px' }}>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="lj-label" style={{ margin: 0 }}>{children}</p>;
}

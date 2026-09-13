import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { go } from '../App';
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { useSession } from '../session';
import type { Profile, Redemption, Reward } from '../types';

export function Shop({ kidId }: { kidId: number }) {
  const me = useSession()!.profile;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [wallet, setWallet] = useState<{ balance: number; available: number; items: Redemption[] } | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const [r, w] = await Promise.all([api.rewards(), api.redemptions(kidId)]);
    setRewards(r.filter((x) => x.active)); setWallet(w);
  }, [kidId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.profiles().then((ps) => setProfile(ps.find((p) => p.id === kidId) ?? null)); }, [kidId]);

  async function pick(r: Reward) {
    try { await api.requestRedemption(r.id); showToast('Aangevraagd! Papa of mama kijkt ernaar 👀'); load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Er ging iets mis'); }
  }

  if (!profile || !wallet) return <div className="center muted">Laden…</div>;
  const pending = wallet.items.filter((i) => i.status === 'wacht');
  const past = wallet.items.filter((i) => i.status !== 'wacht').slice(0, 10);

  return (
    <div className="screen">
      <Header profile={profile} balance={wallet.balance} onProfileChanged={setProfile}>
        <button className="btn btn-small" onClick={() => go(`/week/${kidId}`)}>📅 Week</button>
      </Header>
      <div className="section">
        <h2>🛍️ Winkeltje</h2>
        <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
          Je hebt ⭐ {wallet.balance}{wallet.available !== wallet.balance ? ` (nog ${wallet.available} vrij te besteden)` : ''}.
        </p>
      </div>
      <div className="shop-grid">
        {rewards.map((r) => (
          <div key={r.id} className="reward">
            <span className="icon">{r.icon}</span>
            <span className="title">{r.title}</span>
            <span className="cost">⭐ {r.cost}</span>
            {me.role === 'kid' && <button className="btn btn-primary btn-small" disabled={wallet.available < r.cost} onClick={() => pick(r)}>Kies</button>}
          </div>
        ))}
        {rewards.length === 0 && <div className="muted">Nog geen beloningen. Vraag papa of mama!</div>}
      </div>
      {(pending.length > 0 || past.length > 0) && (
        <div className="section" style={{ marginTop: 16 }}>
          <h2>Mijn aanvragen</h2>
          <div className="list" style={{ padding: 0 }}>
            {[...pending, ...past].map((i) => (
              <div key={i.id} className="list-item">
                <span className="icon">{i.icon}</span>
                <span className="body"><div className="title">{i.title}</div><div className="sub">⭐ {i.cost}</div></span>
                <span className={`pill ${i.status}`}>{i.status === 'wacht' ? '⏳ wacht' : i.status === 'gekregen' ? '✓ gekregen' : '✗ nee'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}

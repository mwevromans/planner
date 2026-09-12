import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Header } from '../components/Header';
import { useSession } from '../session';
import type { Approvals as ApprovalsData, Profile } from '../types';
import { Approvals } from './parent/Approvals';
import { Cards } from './parent/Cards';
import { Family } from './parent/Family';
import { Rewards } from './parent/Rewards';

type Tab = 'keuren' | 'kaarten' | 'beloningen' | 'gezin';

export function ParentPanel() {
  const me = useSession()!.profile;
  const [tab, setTab] = useState<Tab>('keuren');
  const [approvals, setApprovals] = useState<ApprovalsData>({ cards: [], redemptions: [] });
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const load = useCallback(() => {
    api.approvals().then(setApprovals).catch(() => undefined);
    api.profiles().then(setProfiles).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = approvals.cards.length + approvals.redemptions.length;
  const kids = profiles.filter((p) => p.role === 'kid');

  return (
    <div className="screen">
      <Header profile={me} />
      <div className="tabs-bar">
        <button className={tab === 'keuren' ? 'on' : ''} onClick={() => { setTab('keuren'); load(); }}>✓ Keuren{pending > 0 && <span className="count">{pending}</span>}</button>
        <button className={tab === 'kaarten' ? 'on' : ''} onClick={() => setTab('kaarten')}>🗂️ Kaarten</button>
        <button className={tab === 'beloningen' ? 'on' : ''} onClick={() => setTab('beloningen')}>🛍️ Beloningen</button>
        <button className={tab === 'gezin' ? 'on' : ''} onClick={() => setTab('gezin')}>👨‍👩‍👧‍👦 Gezin</button>
      </div>
      {tab === 'keuren' && <Approvals data={approvals} onChanged={load} />}
      {tab === 'kaarten' && <Cards kids={kids} />}
      {tab === 'beloningen' && <Rewards />}
      {tab === 'gezin' && <Family profiles={profiles} onChanged={load} />}
    </div>
  );
}

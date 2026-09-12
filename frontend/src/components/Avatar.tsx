import type { Profile } from '../types';

export function Avatar({ profile, size = 44 }: { profile: Pick<Profile, 'avatar' | 'color'>; size?: number }) {
  return (
    <span className="avatar" style={{ background: profile.color, width: size, height: size, fontSize: size * 0.58, borderRadius: '50%', display: 'grid', placeItems: 'center' }}>
      {profile.avatar}
    </span>
  );
}

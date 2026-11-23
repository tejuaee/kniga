/** Round avatar: the reader's picture, or the first letter of their name. */
export function Avatar({ user, size = 36 }) {
  return (
    <span className="mini-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.username[0].toUpperCase()}
    </span>
  );
}

import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from './auth';
import { LogProvider } from './log-context';
import { Nav } from './components/Nav';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Verify } from './pages/Verify';
import { Home } from './pages/Home';
import { Diary } from './pages/Diary';
import { BookPage } from './pages/BookPage';
import { MyProfile, Profile } from './pages/Profile';
import { Search } from './pages/Search';
import { Follows } from './pages/Follows';
import { EntryPage } from './pages/EntryPage';
import { Notifications } from './pages/Notifications';

function AppShell() {
  return (
    <RequireAuth>
      <LogProvider>
        <Nav />
        <main className="app-main">
          <Outlet />
        </main>
      </LogProvider>
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestOnly>
            <Signup />
          </GuestOnly>
        }
      />
      <Route path="/verify" element={<Verify />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/diary" element={<Diary />} />
        <Route path="/book/:id" element={<BookPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/entry/:id" element={<EntryPage />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<MyProfile />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/u/:username/followers" element={<Follows kind="followers" />} />
        <Route path="/u/:username/following" element={<Follows kind="following" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

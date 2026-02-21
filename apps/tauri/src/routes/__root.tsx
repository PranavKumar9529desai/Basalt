import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
    component: () => (
        <div className="p-4 flex flex-col min-h-screen bg-slate-900 text-slate-100">
            <div className="flex gap-4 p-2 border-b border-slate-700 mb-4">
                <Link to="/" className="hover:text-blue-400 [&.active]:text-blue-500 [&.active]:font-bold">
                    Home
                </Link>
                <Link to="/new" className="hover:text-blue-400 [&.active]:text-blue-500 [&.active]:font-bold">
                    New Page
                </Link>
            </div>
            <Outlet />
        </div>
    ),
})

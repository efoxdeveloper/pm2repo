import { RouterProvider } from 'react-router-dom';

// project imports
import router from 'routes';
import ThemeCustomization from 'themes';
import { Pm2Provider } from 'contexts/Pm2Context';

// ==============================|| APP - THEME, ROUTER, LOCAL ||============================== //

export default function App() {
  return (
    <ThemeCustomization>
      <Pm2Provider>
        <RouterProvider router={router} />
      </Pm2Provider>
    </ThemeCustomization>
  );
}

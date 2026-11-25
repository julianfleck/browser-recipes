import React,{useEffect}from'react';import{createRoot}from'react-dom/client';
import McpsPage from'./McpsPage';import Teachings from'./Teachings';import InstallPage from'./InstallPage';
import{installNavigation,useLocation}from'./navigation';import{initializeWorkspace,refreshWorkspace}from'./workspace-data';
import'./components/arc/foundation.css';import'./product-theme.css';import'./styles.css';
installNavigation();
function Router(){const url=useLocation(),path=url.split('?')[0];useEffect(()=>{void initializeWorkspace();const focus=()=>void refreshWorkspace().catch(()=>{});addEventListener('focus',focus);return()=>removeEventListener('focus',focus);},[]);
 if(path==='/install')return <InstallPage/>;
 const overview=['/','/mcps','/sites'].includes(path)||path==='/teachings'&&!new URLSearchParams(url.split('?')[1]).has('site')&&!new URLSearchParams(url.split('?')[1]).has('teaching');
 return overview?<McpsPage/>:<Teachings key={path.startsWith('/mcps/')?path.split('/')[2]:'legacy'}/>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Router/></React.StrictMode>);

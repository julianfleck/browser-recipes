import React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
export default function RecordMenu({ label, actions, disabled = false }) {
  return <Menu.Root><Menu.Trigger className="record-menu-trigger" aria-label={`Actions for ${label}`} disabled={disabled}><MoreHorizontal size={17}/></Menu.Trigger><Menu.Portal><Menu.Content className="record-menu" align="end" sideOffset={5} collisionPadding={12}>{actions.map(({label,icon:Icon,onSelect,danger}) => <Menu.Item key={label} className={`record-menu-item${danger ? ' is-danger' : ''}`} onSelect={onSelect}>{Icon && <Icon size={15}/>} {label}</Menu.Item>)}</Menu.Content></Menu.Portal></Menu.Root>;
}

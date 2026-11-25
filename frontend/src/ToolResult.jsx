import React from'react';import{ArrowUpRight}from'lucide-react';import'./tool-result.css';
export default function ToolResult({result}){
 const value=result?.result??result?.copied??result;
 if(value?.selections)return <div className="selected-results">{value.selections.map(item=><article className="selected-result" key={item.index}><header><span>{item.index}</span><strong>{item.label}</strong><small>{item.kind}</small></header>{item.text&&<p>{item.text}</p>}{item.images?.map((image,index)=><figure key={index}>{['image/jpeg','image/png'].includes(image.mimeType)&&image.data&&<img src={`data:${image.mimeType};base64,${image.data}`} alt={image.alt||item.label}/>}<figcaption>{image.alt||`${image.width} × ${image.height}`}</figcaption></figure>)}{item.href&&/^https?:\/\//.test(item.href)&&<a href={item.href} target="_blank" rel="noopener noreferrer">Open selected link <ArrowUpRight size={12}/></a>}</article>)}</div>;
 return <div className="text-tool-result">{Array.isArray(value)?<ol>{value.map((text,index)=><li key={index}>{String(text)}</li>)}</ol>:<p>{typeof value==='string'?value:JSON.stringify(value,null,2)}</p>}</div>;
}

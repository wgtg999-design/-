'use client';
import { useState } from 'react';
/** Both photos use the identical object-fit:contain frame, with no distortion. */
export default function BeforeAfterSlider({before,after,ratio}:{before:string;after:string;ratio:number}){
 const [position,setPosition]=useState(50);
 return <div className="comparison" style={{aspectRatio:String(ratio)}}>
  <img className="compare-image" src={after} alt="선택한 의류의 AI 가상 착용 결과" draggable={false}/>
  <div className="before-layer" style={{clipPath:`inset(0 ${100-position}% 0 0)`}}><img className="compare-image" src={before} alt="고객이 올린 원본 사진" draggable={false}/></div>
  <span className="compare-label before-label">BEFORE</span><span className="compare-label after-label">AFTER · AI</span>
  <div className="compare-line" style={{left:position+'%'}} aria-hidden="true"><span>↔</span></div>
  <input type="range" min="0" max="100" step="1" value={position} aria-label="원본과 AI 착용 이미지 비교" aria-valuetext={`원본 ${position}%, AI 착용 ${100-position}%`} onChange={event=>setPosition(Number(event.target.value))}/>
 </div>;
}

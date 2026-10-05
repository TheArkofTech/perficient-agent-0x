import { redirect } from 'next/navigation';
export default async function Brief({searchParams}:{searchParams:Promise<{ticker?:string}>}) {
 const {ticker}=await searchParams;
 redirect('/?mode=local&focus='+encodeURIComponent('Summarize material risks and latest operating performance')+(ticker?'&ticker='+encodeURIComponent(ticker.toUpperCase()):''));
}

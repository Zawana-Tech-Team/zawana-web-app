export async function chooseRentalReplacement(page,{date,courtName,time}){
 await page.getByRole('heading',{name:'Reschedule your court',exact:true}).waitFor();
 const label=new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00Z`));
 for(let attempt=0;attempt<24;attempt++){
  if(await page.getByRole('button',{name:label,exact:true}).count())break;
  await page.getByRole('button',{name:'Next month',exact:true}).click();
 }
 await page.getByRole('button',{name:label,exact:true}).click();
 await page.getByRole('button',{name:'Choose courts',exact:true}).click();
 await page.getByRole('button',{name:new RegExp(`^${courtName} `),expanded:false}).click();
 await page.getByRole('button',{name:`${courtName}, ${time}, Available`,exact:true}).click();
}
export async function reviewRentalReplacement(page){
 if(page.viewportSize().width<1024)await page.getByRole('region',{name:'Selected replacement',exact:true}).getByRole('button',{name:'Review selected reschedule',exact:true}).click();
 else await page.locator('#reschedule-summary').getByRole('button',{name:'Review change',exact:true}).click();
 await page.getByRole('heading',{name:'Review your change',exact:true}).waitFor();
}
export async function choosePrivateReplacement(page,{date,courtName,time}){
 await page.getByRole('heading',{name:'Reschedule your private course',exact:true}).waitFor();
 await page.getByRole('button',{name:'Choose a date',exact:true}).click();
 await page.getByLabel('Session date',{exact:true}).fill(date);
 await page.getByRole('button',{name:'Choose a court',exact:true}).click();
 await page.getByRole('button',{name:new RegExp(`^${courtName}`),expanded:false}).click();
 await page.getByRole('button',{name:`${courtName}, ${time}, Available`,exact:true}).click();
 await page.getByRole('button',{name:'Review replacement',exact:true}).click();
 await page.getByRole('heading',{name:'Review your change',exact:true}).waitFor();
}
